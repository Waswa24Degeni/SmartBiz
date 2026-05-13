import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'AdminLogin'>;
};

export function AdminLoginScreen({ navigation }: Props) {
  const { signIn, signOut, user, profileLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingProfile, setAwaitingProfile] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // After signIn, wait for the profile to finish loading, then verify admin role.
  // If the role is NOT 'admin', sign out immediately and show a clear error.
  React.useEffect(() => {
    if (!awaitingProfile) return;
    if (profileLoading) return; // still loading — wait
    if (!user) return;           // signed out or failed
    setAwaitingProfile(false);
    if (user.role !== 'admin') {
      signOut();
      Alert.alert(
        'Access Denied',
        'This account does not have admin privileges.\n\n' +
        'To fix this, run scripts/fix-admin-rls.sql in your Supabase SQL Editor — ' +
        'it will set role = \'admin\' for this account.',
        [{ text: 'OK' }]
      );
    }
    // If role IS 'admin', AppNavigator will automatically show the Admin panel.
  }, [awaitingProfile, profileLoading, user]);

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdminLogin = async () => {
    if (!validate()) return;

    setLoading(true);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);

    if (error) {
      Alert.alert('Admin Login Failed', error);
      return;
    }

    // Arm the useEffect to verify admin role once profile finishes loading.
    setAwaitingProfile(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Dark charcoal admin background */}
      <View style={styles.bg} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>

        {/* Back to user login */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Login')}>
          <Ionicons name="arrow-back" size={18} color={COLORS.white} />
          <Text style={styles.backText}>User Login</Text>
        </TouchableOpacity>

        <View style={styles.center}>
          {/* Shield logo */}
          <View style={styles.shieldWrap}>
            <Ionicons name="shield-checkmark" size={36} color={COLORS.accent} />
          </View>
          <Text style={styles.appName}>SmartBiz</Text>
          <View style={styles.adminPill}>
            <Ionicons name="lock-closed" size={11} color={COLORS.white} />
            <Text style={styles.adminPillText}>ADMIN PORTAL</Text>
          </View>
          <Text style={styles.tagline}>Restricted access — authorised personnel only</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          {/* Warning banner */}
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
            <Text style={styles.warningText}>
              This portal is for system administrators only. Unauthorised access attempts are logged.
            </Text>
          </View>

          <Text style={styles.title}>Admin Sign In</Text>

          <Input
            label="Admin Email"
            placeholder="Enter admin email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
            error={errors.email}
          />
          <Input
            label="Password"
            placeholder="Enter password"
            value={password}
            onChangeText={setPassword}
            isPassword
            leftIcon="lock-closed-outline"
            error={errors.password}
          />
          <Button
            title="Access Admin Panel"
            onPress={handleAdminLogin}
            loading={loading}
            fullWidth
            size="lg"
          />

          <Text style={styles.hint}>
            Need admin access? Contact the platform owner.
          </Text>
        </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0A0F0D' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0F0D' },
  content: {
    flexGrow: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: 460 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    marginBottom: SPACING.xl,
    paddingVertical: SPACING.xs,
  },
  backText: { color: COLORS.white, fontSize: FONTS.sizes.sm },
  center: { alignItems: 'center', marginBottom: SPACING.xl },
  shieldWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  appName: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.error,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.sm,
  },
  adminPillText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FONTS.sizes.xs,
    textAlign: 'center',
    maxWidth: 260,
  },
  card: {
    backgroundColor: '#111A14',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(196,154,42,0.3)',
    gap: SPACING.sm,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  warningText: {
    flex: 1,
    fontSize: FONTS.sizes.xs,
    color: '#92400E',
    lineHeight: 16,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  hint: {
    fontSize: FONTS.sizes.xs,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
