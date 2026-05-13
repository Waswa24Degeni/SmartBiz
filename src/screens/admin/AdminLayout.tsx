import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, BREAKPOINTS } from '../../lib/constants';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { AdminUsersScreen } from './AdminUsersScreen';
import { AdminBusinessesScreen } from './AdminBusinessesScreen';
import { AdminPlansScreen } from './AdminPlansScreen';
import { AdminSupportScreen } from './AdminSupportScreen';
import { AdminPaymentScreen } from './AdminPaymentScreen';
import { AdminSettingsScreen } from './AdminSettingsScreen';
import { AdminRevenueScreen } from './AdminRevenueScreen';

export type AdminRoute = 'Overview' | 'Users' | 'Businesses' | 'Revenue' | 'Plans' | 'Support' | 'Payments' | 'Settings';

const NAV_ITEMS: { route: AdminRoute; icon: string; label: string }[] = [
  { route: 'Overview',  icon: 'grid-outline',         label: 'Overview' },
  { route: 'Users',     icon: 'people-outline',        label: 'Users' },
  { route: 'Businesses',icon: 'business-outline',      label: 'Businesses' },
  { route: 'Revenue',   icon: 'bar-chart-outline',     label: 'Revenue' },
  { route: 'Plans',     icon: 'pricetag-outline',      label: 'Plans' },
  { route: 'Payments',  icon: 'card-outline',          label: 'Payments' },
  { route: 'Support',   icon: 'help-circle-outline',   label: 'Support' },
  { route: 'Settings',  icon: 'settings-outline',       label: 'Settings' },
];

function AdminSidebarContent({
  route,
  setRoute,
  user,
  signOut,
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  route: AdminRoute;
  setRoute: (r: AdminRoute) => void;
  user: any;
  signOut: () => void;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  return (
    <View style={[styles.sidebar, collapsed ? styles.sidebarCollapsed : styles.sidebarExpanded]}>
      <View style={styles.logoRow}>
        <View style={styles.logoIcon}>
          <Ionicons name="shield-checkmark" size={20} color={COLORS.accent} />
        </View>
        {!collapsed && (
          <View style={{ flex: 1 }}>
            <Text style={styles.logoTitle}>SmartBiz</Text>
            <Text style={styles.logoSub}>Admin Panel</Text>
          </View>
        )}
        {onToggleCollapse && !onClose && (
          <TouchableOpacity onPress={onToggleCollapse} style={{ padding: 4 }}>
            <Ionicons
              name={collapsed ? 'chevron-forward-outline' : 'chevron-back-outline'}
              size={18}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>
        )}
        {onClose && (
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const active = route === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.navItem, collapsed && styles.navItemCollapsed, active && styles.navItemActive]}
              onPress={() => { setRoute(item.route); onClose?.(); }}
            >
              <Ionicons
                name={item.icon as any}
                size={18}
                color={active ? COLORS.accent : COLORS.textMuted}
              />
              {!collapsed && (
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Profile footer */}
      <View style={styles.profileFooter}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.full_name?.charAt(0).toUpperCase() ?? 'A'}
          </Text>
        </View>
        {!collapsed && (
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user?.full_name ?? 'Admin'}
            </Text>
            <Text style={styles.profileRole}>Super Admin</Text>
          </View>
        )}
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function AdminLayout() {
  const [route, setRoute] = useState<AdminRoute>('Overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  const renderContent = () => {
    switch (route) {
      case 'Overview': return <AdminDashboardScreen />;
      case 'Users': return <AdminUsersScreen />;
      case 'Businesses': return <AdminBusinessesScreen />;
      case 'Revenue': return <AdminRevenueScreen />;
      case 'Plans': return <AdminPlansScreen />;
      case 'Payments': return <AdminPaymentScreen />;
      case 'Support': return <AdminSupportScreen />;
      case 'Settings': return <AdminSettingsScreen />;
      default: return <AdminDashboardScreen />;
    }
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {/* Persistent sidebar — tablet/desktop */}
      {!isMobile && (
        <AdminSidebarContent
          route={route}
          setRoute={setRoute}
          user={user}
          signOut={signOut}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
      )}

      {/* Mobile drawer overlay */}
      {isMobile && drawerOpen && (
        <>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setDrawerOpen(false)}
          />
          <View style={styles.drawer}>
            <AdminSidebarContent
              route={route}
              setRoute={setRoute}
              user={user}
              signOut={signOut}
              collapsed={false}
              onClose={() => setDrawerOpen(false)}
            />
          </View>
        </>
      )}

      {/* Main content area */}
      <View style={styles.main}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
          <View style={styles.topLeft}>
            {isMobile && (
              <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.menuBtn}>
                <Ionicons name="menu-outline" size={24} color={COLORS.text} />
              </TouchableOpacity>
            )}
            {!isMobile && (
              <TouchableOpacity onPress={() => setSidebarCollapsed((prev) => !prev)} style={styles.menuBtn}>
                <Ionicons
                  name={sidebarCollapsed ? 'chevron-forward-outline' : 'chevron-back-outline'}
                  size={22}
                  color={COLORS.text}
                />
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.pageTitle}>{route}</Text>
              <Text style={styles.pageSub}>SmartBiz Admin Panel</Text>
            </View>
          </View>
          <View style={styles.topRight}>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.white} />
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
          </View>
        </View>

        {/* Screen content */}
        <View style={styles.content}>
          {renderContent()}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.background },
  // Sidebar
  sidebar: {
    backgroundColor: '#0F2318',
    paddingTop: 20,
  },
  sidebarExpanded: { width: 210 },
  sidebarCollapsed: { width: 78 },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTitle: { color: COLORS.white, fontSize: FONTS.sizes.md, fontWeight: '700' },
  logoSub: { color: COLORS.accent, fontSize: FONTS.sizes.xs },
  nav: { flex: 1, paddingHorizontal: SPACING.sm },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 11,
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
    marginBottom: 2,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  navItemActive: { backgroundColor: COLORS.primaryLight },
  navLabel: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  navLabelActive: { color: COLORS.white, fontWeight: '600' },
  // Profile footer
  profileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.base,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: SPACING.sm,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.white, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { color: COLORS.white, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  profileRole: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  logoutBtn: { padding: 4 },
  // Mobile drawer
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 240,
    zIndex: 20,
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.base,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  menuBtn: { padding: 4 },
  pageTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  pageSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadgeText: { color: COLORS.white, fontSize: FONTS.sizes.xs, fontWeight: '700' },
  // Main
  main: { flex: 1 },
  content: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  placeholderTitle: { fontSize: FONTS.sizes.lg, fontWeight: '600', color: COLORS.text },
  placeholderSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
});
