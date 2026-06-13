import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sidebar } from '../components/common/Sidebar';
import { DashboardScreen } from './dashboard/DashboardScreen';
import { CategoryItemsScreen } from './products/CategoryItemsScreen';
import { BillsScreen } from './bills/BillsScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { Header } from '../components/common/Header';
import { COLORS, BREAKPOINTS } from '../lib/constants';
import { Category, Product } from '../types';
import { MessagesScreen } from './messages/MessagesScreen';
import { SupportScreen } from './support';
import { POSScreen } from './pos';
import { ReportsScreen } from './reports';
import { StaffScreen } from './staff/StaffScreen';
import { CustomersScreen } from './customers';
import { WalletScreen } from './wallet/WalletScreen';
import { NotificationsScreen } from './notifications/NotificationsScreen';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Route = 'Dashboard' | 'Inventory' | 'POS' | 'Reports' | 'Messages' | 'Bills' | 'Customers' | 'Wallet' | 'Settings' | 'Notifications' | 'Support' | 'Staff';

const ROUTE_PERMISSIONS: Record<Route, string> = {
  Dashboard: 'dashboard',
  Inventory: 'inventory',
  POS: 'pos',
  Reports: 'reports',
  Messages: 'messages',
  Bills: 'bills',
  Customers: 'customers',
  Wallet: 'pos',        // cashiers + owners can view wallet
  Settings: 'settings',
  Notifications: 'dashboard',
  Support: 'support',
  Staff: 'staff_manage',
};

const NAV_ITEMS: { label: string; icon: string; route: Route }[] = [
  { label: 'Dashboard', icon: 'grid-outline',        route: 'Dashboard' },
  { label: 'Inventory', icon: 'cube-outline',         route: 'Inventory' },
  { label: 'POS',       icon: 'cart-outline',         route: 'POS' },
  { label: 'Reports',   icon: 'bar-chart-outline',    route: 'Reports' },
  { label: 'Wallet',    icon: 'wallet-outline',       route: 'Wallet' },
  { label: 'Messages',  icon: 'chatbubble-outline',   route: 'Messages' },
  { label: 'Bills',     icon: 'receipt-outline',      route: 'Bills' },
  { label: 'Customers', icon: 'people-circle-outline',route: 'Customers' },
  { label: 'Staff',     icon: 'people-outline',       route: 'Staff' },
  { label: 'Settings',  icon: 'settings-outline',     route: 'Settings' },
];

export function MainLayout() {
  const { user, business } = useAuth();
  const [route, setRoute] = useState<Route>('Dashboard');
  const [isRouteLoaded, setIsRouteLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [billPrefillProduct, setBillPrefillProduct] = useState<Product | null>(null);
  const [billPrefillNonce, setBillPrefillNonce] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [staffPerms, setStaffPerms] = useState<string[] | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [openOrders, setOpenOrders] = useState(0);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;
  const drawerWidth = Math.min(Math.max(width * 0.86, 240), 320);

  React.useEffect(() => {
    AsyncStorage.getItem('smartbiz_last_route').then((savedRoute) => {
      if (savedRoute && ROUTE_PERMISSIONS[savedRoute as Route]) {
        setRoute(savedRoute as Route);
      }
      setIsRouteLoaded(true);
    });
  }, []);

  React.useEffect(() => {
    const loadStaffPerms = async () => {
      if (!user || !business?.id) {
        setStaffPerms(null);
        return;
      }
      if (user.role === 'owner') {
        setStaffPerms(['*']);
        return;
      }
      // Platform admin should never be in MainLayout; give them no permissions
      if (user.role === 'admin') {
        setStaffPerms([]);
        return;
      }
      const { data } = await supabase
        .from('staff')
        .select('permissions, is_active')
        .eq('business_id', business.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!data || (data as any).is_active === false) {
        setStaffPerms([]);
        return;
      }
      const perms: string[] = Array.isArray((data as any).permissions) ? (data as any).permissions : [];
      // Cashier staff get pos access; include their explicit permissions
      setStaffPerms(perms);
    };

    loadStaffPerms();
  }, [user, business?.id]);

  const refreshBadges = React.useCallback(async () => {
    if (!business?.id || !user?.id) {
      setUnreadNotifications(0);
      setOpenOrders(0);
      return;
    }

    const [notifRes, ordersRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('status', 'active'),
    ]);

    if (!notifRes.error) setUnreadNotifications(notifRes.count ?? 0);
    if (!ordersRes.error) setOpenOrders(ordersRes.count ?? 0);
  }, [business?.id, user?.id]);

  React.useEffect(() => {
    refreshBadges();
  }, [refreshBadges, route]);

  React.useEffect(() => {
    if (!business?.id || !user?.id) return;
    const notifChannel = supabase
      .channel(`badge-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => refreshBadges(),
      )
      .subscribe();

    const salesChannel = supabase
      .channel(`badge-sales-${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales', filter: `business_id=eq.${business.id}` },
        () => refreshBadges(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(salesChannel);
    };
  }, [business?.id, user?.id, refreshBadges]);

  const hasAccess = React.useCallback((r: Route) => {
    // Platform admin accounts belong in AdminLayout, not here
    if (user?.role === 'admin') return false;
    if (user?.role === 'owner') return true;
    if (!staffPerms) return false;
    return staffPerms.includes('*') || staffPerms.includes(ROUTE_PERMISSIONS[r]);
  }, [user?.role, staffPerms]);

  const allowedNavItems = NAV_ITEMS
    .filter((item) => hasAccess(item.route))
    .map((item) => ({
      ...item,
      badge: item.route === 'Bills' && openOrders > 0 ? openOrders : undefined,
    }));

  React.useEffect(() => {
    if (allowedNavItems.length === 0) return;
    if (!hasAccess(route)) {
      const fallback = allowedNavItems[0].route;
      setRoute(fallback);
      AsyncStorage.setItem('smartbiz_last_route', fallback).catch(() => {});
      setSelectedCategory(null);
    }
  }, [route, hasAccess, allowedNavItems]);

  const getBreadcrumbs = () => {
    return [];
  };

  const handleBack = () => {
    if (route === 'Inventory' && selectedCategory) {
      setSelectedCategory(null);
    }
  };

  const canGoBack = route === 'Inventory' && selectedCategory !== null;

  const handleNavigate = (r: string) => {
    const next = r as Route;
    if (!hasAccess(next)) return;
    setRoute(next);
    AsyncStorage.setItem('smartbiz_last_route', next).catch(() => {});
    setSelectedCategory(null);
    if (next !== 'Bills') {
      setBillPrefillProduct(null);
    }
    setDrawerOpen(false);
  };

  const handleInventoryAddToOrder = (product: Product) => {
    if (!hasAccess('Bills')) return;
    setBillPrefillProduct(product);
    setBillPrefillNonce((n) => n + 1);
    setRoute('Bills');
    AsyncStorage.setItem('smartbiz_last_route', 'Bills').catch(() => {});
    setSelectedCategory(null);
    setDrawerOpen(false);
  };

  const renderContent = () => {
    if (!isRouteLoaded) return null;
    
    if (!hasAccess(route)) {
      return <NoAccessScreen />;
    }

    switch (route) {
      case 'Dashboard':
        return <DashboardScreen />;
      case 'Inventory':
        return (
          <CategoryItemsScreen
            category={selectedCategory}
            onBack={() => setSelectedCategory(null)}
            onAddToOrder={handleInventoryAddToOrder}
          />
        );
      case 'Bills':
        return <BillsScreen prefillProduct={billPrefillProduct} prefillNonce={billPrefillNonce} />;
      case 'POS':
        return <POSScreen />;
      case 'Reports':
        return <ReportsScreen />;
      case 'Customers':
        return <CustomersScreen />;
      case 'Wallet':
        return <WalletScreen />;
      case 'Settings':
        return <SettingsScreen />;
      case 'Messages':
        return <MessagesScreen />;
      case 'Notifications':
        return <NotificationsScreen />;
      case 'Support':
        return <SupportScreen />;
      case 'Staff':
        return <StaffScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Persistent sidebar — tablet/desktop only */}
      {!isMobile && (
        <View style={[styles.sidebar, sidebarCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded]}>
          <Sidebar
            activeRoute={route}
            onNavigate={handleNavigate}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            navItems={allowedNavItems}
          />
        </View>
      )}

      {/* Mobile drawer overlay */}
      {isMobile && drawerOpen && (
        <>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => setDrawerOpen(false)}
          />
          <View style={[styles.drawer, { width: drawerWidth }]}>
            <Sidebar activeRoute={route} onNavigate={handleNavigate} navItems={allowedNavItems} />
          </View>
        </>
      )}

      {/* Main content */}
      <View style={styles.main}>
        <Header
          title={route === 'Inventory' ? (selectedCategory ? selectedCategory.name : 'Inventory') : route}
          breadcrumbs={getBreadcrumbs()}
          onBack={canGoBack ? handleBack : undefined}
          onMenuPress={isMobile ? () => setDrawerOpen(true) : undefined}
          onNotificationsPress={() => setRoute('Notifications')}
          onActivityPress={() => setRoute('Bills')}
          notificationsBadge={unreadNotifications}
          activityBadge={openOrders}
          rightActions={!isMobile ? (
            <TouchableOpacity
              style={styles.desktopCollapseBtn}
              onPress={() => setSidebarCollapsed((prev) => !prev)}
            >
              <Text style={styles.desktopCollapseText}>{sidebarCollapsed ? 'Expand' : 'Collapse'}</Text>
            </TouchableOpacity>
          ) : undefined}
        />
        <View style={styles.content}>
          {renderContent()}
        </View>
      </View>
    </View>
  );
}

function NoAccessScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>Access Restricted</Text>
      <Text style={styles.placeholderSub}>Your staff permissions do not allow this module.</Text>
    </View>
  );
}

function PlaceholderScreen({ title, icon }: { title: string; icon: string }) {
  const { Ionicons } = require('@expo/vector-icons');
  return (
    <View style={styles.placeholder}>
      <Ionicons name={icon} size={48} color={COLORS.textMuted} />
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSub}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    height: '100%',
  },
  sidebarExpanded: { width: 220 },
  sidebarCollapsed: { width: 80 },
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
    zIndex: 20,
  },
  main: {
    flex: 1,
    backgroundColor: COLORS.background,
    minWidth: 0,
  },
  content: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  placeholderSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  desktopCollapseBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  desktopCollapseText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
