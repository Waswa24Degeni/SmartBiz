import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { SettingsProvider } from '../context/SettingsContext';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { AdminLoginScreen } from '../screens/auth/AdminLoginScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { MainLayout } from '../screens/MainLayout';
import { AdminLayout } from '../screens/admin/AdminLayout';
import { COLORS } from '../lib/constants';

const Stack = createNativeStackNavigator();

function RootNavigator() {
  const { session, user, business, loading, profileLoading } = useAuth();

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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Admin" component={AdminLayout} />
      </Stack.Navigator>
    );
  }

  // Authenticated but no business → Onboarding
  if (!business) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  // Fully ready → Main app
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
