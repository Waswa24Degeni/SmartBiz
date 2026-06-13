import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform, Image, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONTS, RADIUS, SHADOWS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

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
  const { user, business, businesses, signOut, switchBusiness } = useAuth();
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [showShopModal, setShowShopModal] = React.useState(false);
  const [newShopName, setNewShopName] = React.useState('');
  const [isAddingShop, setIsAddingShop] = React.useState(false);

  const bName     = business?.name ?? 'SmartBiz';
  const bInitials = getInitials(bName);
  const logoUrl = business?.logo_url?.trim() ?? '';
  const showLogo = !!logoUrl && !logoFailed;

  React.useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

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
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-restricted-globals
      if (confirm('Do you want to sign out?')) signOut();
    } else {
      Alert.alert('Sign out', 'Do you want to sign out now?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
      ]);
    }
  };

  const handleAddShop = async () => {
    if (!newShopName.trim()) {
      Alert.alert('Error', 'Please enter a business name');
      return;
    }
    
    setIsAddingShop(true);
    try {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .in('business_id', businesses.map(b => b.id));
      
      let hasPaidPlan = false;
      if (subs) {
        hasPaidPlan = subs.some(s => s.status === 'active' && s.plan !== 'free');
      }
      
      const limit = hasPaidPlan ? 2 : 1;
      
      if (businesses.length >= limit) {
        Alert.alert('Limit Reached', `Your plan is limited to ${limit} business(es). Upgrade to add more.`);
        setIsAddingShop(false);
        return;
      }
      
      const { data: newBiz, error: createErr } = await supabase
        .from('businesses')
        .insert({ name: newShopName.trim(), owner_id: user?.id })
        .select()
        .single();
        
      if (createErr) throw createErr;
      
      await switchBusiness(newBiz.id);
      setShowShopModal(false);
      setNewShopName('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add business');
    } finally {
      setIsAddingShop(false);
    }
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
      <Pressable 
        style={[styles.logo, collapsed && styles.logoCollapsed]}
        onPress={() => user?.role === 'owner' && setShowShopModal(true)}
      >
        <LinearGradient
          colors={['#C49A2A', '#A67C1E']}
          style={styles.logoIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {showLogo ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoImage}
              resizeMode="cover"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <Text style={styles.logoText}>{bInitials}</Text>
          )}
        </LinearGradient>
        {!collapsed && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logoName} numberOfLines={1}>{bName}</Text>
              <Text style={styles.logoSub}>Business Portal</Text>
            </View>
            {user?.role === 'owner' && (
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.5)" />
            )}
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
      </Pressable>

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

      <Modal visible={showShopModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your Businesses</Text>
              <Pressable onPress={() => setShowShopModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 200, marginBottom: SPACING.md }}>
              {businesses?.map(b => (
                <Pressable
                  key={b.id}
                  style={[styles.shopItem, b.id === business?.id && styles.shopItemActive]}
                  onPress={() => {
                    if (b.id !== business?.id) switchBusiness(b.id);
                    setShowShopModal(false);
                  }}
                >
                  <Ionicons name={b.id === business?.id ? "checkmark-circle" : "storefront-outline"} size={20} color={b.id === business?.id ? COLORS.primary : COLORS.textSecondary} />
                  <Text style={[styles.shopItemText, b.id === business?.id && styles.shopItemTextActive]}>{b.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.addShopContainer}>
              <Text style={styles.modalSubtitle}>Add Another Business</Text>
              <TextInput
                style={styles.shopInput}
                placeholder="New Business Name"
                value={newShopName}
                onChangeText={setNewShopName}
              />
              <Pressable 
                style={[styles.addShopBtn, isAddingShop && { opacity: 0.7 }]}
                onPress={handleAddShop}
                disabled={isAddingShop}
              >
                {isAddingShop ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
                    <Text style={styles.addShopBtnText}>Add Business</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    width: 34,
    height: 34,
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
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: RADIUS.md,
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
    minHeight: 44,
    paddingVertical: SPACING.sm,
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
    minHeight: 44,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs + 3,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  shopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  shopItemActive: {
    backgroundColor: 'rgba(196,154,42,0.1)',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  shopItemText: {
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    fontWeight: '500',
  },
  shopItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  addShopContainer: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalSubtitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  shopInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    fontSize: FONTS.sizes.base,
    marginBottom: SPACING.sm,
  },
  addShopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  addShopBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: FONTS.sizes.base,
  },
});
