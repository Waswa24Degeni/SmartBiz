import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sidebar } from '../components/common/Sidebar';
import { DashboardScreen } from './dashboard/DashboardScreen';
import { CategoriesScreen } from './products/CategoriesScreen';
import { CategoryItemsScreen } from './products/CategoryItemsScreen';
import { BillsScreen } from './bills/BillsScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { Header } from '../components/common/Header';
import { COLORS, BREAKPOINTS } from '../lib/constants';
import { Category } from '../types';
import { MessagesScreen } from './messages/MessagesScreen';
import { SupportScreen } from './support/SupportScreen';
import { POSScreen } from './pos';
import { ReportsScreen } from './reports';
import { StaffScreen } from './staff/StaffScreen';
import { CustomersScreen } from './customers';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type Route = 'Dashboard' | 'Inventory' | 'POS' | 'Reports' | 'Messages' | 'Bills' | 'Customers' | 'Settings' | 'Notifications' | 'Support' | 'Staff';

const ROUTE_PERMISSIONS: Record<Route, string> = {
  Dashboard: 'dashboard',
  Inventory: 'inventory',
  POS: 'pos',
  Reports: 'reports',
  Messages: 'messages',
  Bills: 'bills',
  Customers: 'customers',
  Settings: 'settings',
  Notifications: 'dashboard',
  Support: 'support',
  Staff: 'staff_manage',
};

const NAV_ITEMS: { label: string; icon: string; route: Route }[] = [
  { label: 'Dashboard', icon: 'grid-outline', route: 'Dashboard' },
  { label: 'Inventory', icon: 'cube-outline', route: 'Inventory' },
  { label: 'POS', icon: 'cart-outline', route: 'POS' },
  { label: 'Reports', icon: 'bar-chart-outline', route: 'Reports' },
  { label: 'Messages', icon: 'chatbubble-outline', route: 'Messages' },
  { label: 'Bills', icon: 'receipt-outline', route: 'Bills' },
  { label: 'Customers', icon: 'people-circle-outline', route: 'Customers' },
  { label: 'Staff', icon: 'people-outline', route: 'Staff' },
  { label: 'Settings', icon: 'settings-outline', route: 'Settings' },
];

export function MainLayout() {
  const { user, business } = useAuth();
  const [route, setRoute] = useState<Route>('Dashboard');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [staffPerms, setStaffPerms] = useState<string[] | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.tablet;

  React.useEffect(() => {
    const loadStaffPerms = async () => {
      if (!user || !business?.id) {
        setStaffPerms(null);
        return;
      }
      if (user.role === 'owner' || user.role === 'admin') {
        setStaffPerms(['*']);
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
      const perms = Array.isArray((data as any).permissions) ? (data as any).permissions : [];
      setStaffPerms(perms);
    };

    loadStaffPerms();
  }, [user, business?.id]);

  const hasAccess = React.useCallback((r: Route) => {
    if (user?.role === 'owner' || user?.role === 'admin') return true;
    if (!staffPerms) return false;
    return staffPerms.includes('*') || staffPerms.includes(ROUTE_PERMISSIONS[r]);
  }, [user?.role, staffPerms]);

  const allowedNavItems = NAV_ITEMS.filter((item) => hasAccess(item.route));

  React.useEffect(() => {
    if (allowedNavItems.length === 0) return;
    if (!hasAccess(route)) {
      setRoute(allowedNavItems[0].route);
      setSelectedCategory(null);
    }
  }, [route, hasAccess, allowedNavItems]);

  const getBreadcrumbs = () => {
    if (route === 'Dashboard') return ['Dashboard', 'Sales statistics'];
    if (route === 'Inventory' && selectedCategory) return ['Inventory', 'Categories', selectedCategory.name];
    if (route === 'Inventory') return ['Inventory', 'Categories'];
    if (route === 'POS') return ['POS', 'Checkout'];
    if (route === 'Reports') return ['Reports', 'Sales analytics'];
    if (route === 'Bills') return ['Bills', 'Payment history'];
    if (route === 'Customers') return ['Customers', 'Customer directory'];
    if (route === 'Settings') return ['Settings'];
    return [route];
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
    setSelectedCategory(null);
    setDrawerOpen(false);
  };

  const renderContent = () => {
    if (!hasAccess(route)) {
      return <NoAccessScreen />;
    }

    switch (route) {
      case 'Dashboard':
        return <DashboardScreen />;
      case 'Inventory':
        if (selectedCategory) {
          return (
            <CategoryItemsScreen
              category={selectedCategory}
              onBack={() => setSelectedCategory(null)}
            />
          );
        }
        return <CategoriesScreen onCategorySelect={setSelectedCategory} />;
      case 'Bills':
        return <BillsScreen />;
      case 'POS':
        return <POSScreen />;
      case 'Reports':
        return <ReportsScreen />;
      case 'Customers':
        return <CustomersScreen />;
      case 'Settings':
        return <SettingsScreen />;
      case 'Messages':
        return <MessagesScreen />;
      case 'Notifications':
        return <PlaceholderScreen title="Notifications" icon="notifications-outline" />;
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
          <View style={styles.drawer}>
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
          rightActions={!isMobile ? (
            <TouchableOpacity
              style={styles.desktopCollapseBtn}
              onPress={() => setSidebarCollapsed((prev) => !prev)}
            >
              <Text style={styles.desktopCollapseText}>{sidebarCollapsed ? 'Expand' : 'Collapse'}</Text>
            </TouchableOpacity>
          ) : undefined}
          showSearch={route === 'Inventory' || route === 'POS'}
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
    width: 260,
    zIndex: 20,
  },
  main: {
    flex: 1,
    backgroundColor: COLORS.background,
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
