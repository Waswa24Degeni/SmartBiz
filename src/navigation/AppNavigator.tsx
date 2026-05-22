import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { SettingsProvider } from '../context/SettingsContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../lib/constants';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { AdminLoginScreen } from '../screens/auth/AdminLoginScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { MainLayout } from '../screens/MainLayout';
import { AdminLayout } from '../screens/admin/AdminLayout';

const Stack = createNativeStackNavigator();

const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  gestureEnabled: true,
  // iOS benefits from full-screen back swipe + gesture-driven animation.
  fullScreenGestureEnabled: Platform.OS === 'ios',
  animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
};

// ─── Shown when the user has a business but payment is still pending ─────────
function PaymentPendingScreen() {
  const { refreshUser } = useAuth();
  const [checking, setChecking] = React.useState(false);

  const handleCheck = async () => {
    setChecking(true);
    await refreshUser();
    setChecking(false);
  };

  return (
    <View style={pendingStyles.container}>
      <View style={pendingStyles.iconWrap}>
        <Ionicons name="time-outline" size={44} color={COLORS.warning} />
      </View>
      <Text style={pendingStyles.title}>Payment Pending</Text>
      <Text style={pendingStyles.body}>
        Your subscription payment is awaiting confirmation.{`\n\n`}
        Check your phone for the USSD prompt and enter your PIN to complete the payment. Your dashboard will unlock automatically once confirmed.
      </Text>
      <TouchableOpacity
        style={[pendingStyles.btn, checking && { opacity: 0.65 }]}
        onPress={handleCheck}
        disabled={checking}
      >
        {checking
          ? <ActivityIndicator color={COLORS.white} size="small" />
          : <Text style={pendingStyles.btnText}>Check Payment Status</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const pendingStyles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING['2xl'],
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COLORS.warning + '20',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  title:   { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm, textAlign: 'center' },
  body:    { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: SPACING['2xl'] },
  btn:     { backgroundColor: COLORS.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: RADIUS.lg, minWidth: 200, alignItems: 'center' },
  btnText: { color: COLORS.white, fontWeight: '700', fontSize: FONTS.sizes.base },
});
// ─────────────────────────────────────────────────────────────────────────────

function RootNavigator() {
  const { session, user, business, subscription, loading, profileLoading } = useAuth();

  // Show spinner while initial auth check OR profile is loading after sign-in
  if (loading || profileLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Not authenticated → Auth stack
  if (!session) {
    return (
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
      </Stack.Navigator>
    );
  }

  // Admin user → Admin panel (no business needed)
  // Check both DB role and email — guards against the trigger creating the row
  // with role='owner' before the explicit UPDATE in fix-auth.sql can correct it.
  const isAdmin = user?.role === 'admin' || user?.email === 'admin@smartbiz.tz';
  if (isAdmin) {
    return (
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="Admin" component={AdminLayout} />
      </Stack.Navigator>
    );
  }

  // Authenticated but no business → Onboarding
  if (!business) {
    return (
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  // Business exists but payment not yet confirmed → gate dashboard
  if (subscription?.status === 'pending') {
    return (
      <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="PaymentPending" component={PaymentPendingScreen} />
      </Stack.Navigator>
    );
  }

  // Fully ready → Main app
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Main" component={MainLayout} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <CartProvider>
            <SettingsProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </SettingsProvider>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
