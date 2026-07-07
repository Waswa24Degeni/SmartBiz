import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

function normalizeTzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `255${digits.slice(1)}`;
  if (digits.length === 9) return `255${digits}`;
  return digits;
}

function isValidTzPhone(raw: string): boolean {
  return /^255\d{9}$/.test(normalizeTzPhone(raw));
}

function hasLetter(raw: string): boolean {
  return /[A-Za-z]/.test(raw);
}

function isValidPersonName(raw: string): boolean {
  const v = raw.trim();
  return v.length >= 3 && v.length <= 80 && hasLetter(v) && !/\d/.test(v);
}

function isValidBusinessName(raw: string): boolean {
  const v = raw.trim();
  return v.length >= 3 && v.length <= 100 && hasLetter(v);
}

function isValidEmailStrict(raw: string): boolean {
  const v = raw.trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v);
}

export function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validateAccount = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    else if (!isValidPersonName(fullName)) e.fullName = 'Enter a valid full name (3-80 chars, no numbers)';
    if (!businessName.trim()) e.businessName = 'Business name is required';
    else if (!isValidBusinessName(businessName)) e.businessName = 'Enter a valid business name (3-100 chars, letters required)';
    if (!email.trim()) e.email = 'Email is required';
    else if (!isValidEmailStrict(email)) e.email = 'Invalid email address';
    if (phone.trim()) {
      if (/[a-zA-Z]/.test(phone)) e.phone = 'Phone number should not contain letters';
      else if (!isValidTzPhone(phone)) e.phone = 'Enter a valid Tanzania mobile number';
    }
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Minimum 6 characters';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreateAccount = async () => {
    if (!validateAccount()) return;
    setLoading(true);
    try {
      const cleanFullName = fullName.trim();
      const cleanBusinessName = businessName.trim();

      const { error: signUpError } = await signUp(
        email.trim().toLowerCase(),
        password,
        cleanFullName,
        { business_name: cleanBusinessName }
      );

      if (signUpError) {
        if (signUpError.includes('confirmation') || signUpError.includes('verify')) {
          Alert.alert(
            'Almost there!',
            'Check your email and click the confirmation link, then log in.'
          );
        } else {
          Alert.alert('Registration Failed', signUpError);
        }
      }
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.navigate('Login')}>
        <Ionicons name="arrow-back" size={28} color={COLORS.white} />
      </TouchableOpacity>
      <View style={styles.logoIcon}>
        <Text style={styles.logoText}>SE</Text>
      </View>
      <Text style={styles.appName}>SmartEnterprise</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={[COLORS.primary, '#0F2318']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {renderHeader()}
          
          <View style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Set up your profile to get started</Text>

            <Input
              label="Full Name"
              placeholder="Your full name"
              value={fullName}
              onChangeText={setFullName}
              leftIcon="person-outline"
              error={errors.fullName}
            />
            <Input
              label="Business Name"
              placeholder="Your business name"
              value={businessName}
              onChangeText={setBusinessName}
              leftIcon="business-outline"
              error={errors.businessName}
            />
            <Input
              label="Email address"
              placeholder="business@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon="mail-outline"
              error={errors.email}
            />
            <Input
              label="Phone Number (optional)"
              placeholder="0712 345 678"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              leftIcon="call-outline"
              error={errors.phone}
            />
            <Input
              label="Password"
              placeholder="Create a strong password"
              value={password}
              onChangeText={setPassword}
              isPassword
              leftIcon="lock-closed-outline"
              error={errors.password}
            />
            <Input
              label="Confirm Password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPassword
              leftIcon="lock-closed-outline"
              error={errors.confirmPassword}
            />

            <Button
              title="Create Account"
              onPress={handleCreateAccount}
              fullWidth
              size="lg"
              style={styles.btn}
              loading={loading}
            />

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLink}>
              <Text style={styles.loginText}>
                Already have an account? <Text style={styles.loginAction}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.primary },
  content: { flexGrow: 1, padding: SPACING.xl, justifyContent: 'center', alignItems: 'center', paddingBottom: SPACING['4xl'] },
  inner: { width: '100%', maxWidth: 480 },

  // Header
  header: { alignItems: 'center', marginBottom: SPACING.lg, width: '100%', position: 'relative' },
  headerBackBtn: { position: 'absolute', left: 0, top: 0, padding: SPACING.xs },
  logoIcon: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  logoText: { color: COLORS.white, fontSize: FONTS.sizes.lg, fontWeight: 'bold' },
  appName: { color: COLORS.white, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },

  // Card
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, gap: SPACING.xs },
  title: { fontSize: FONTS.sizes['2xl'], fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginBottom: SPACING.sm },

  btn: { marginTop: SPACING.sm },
  loginLink: { alignItems: 'center', marginTop: SPACING.sm },
  loginText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base },
  loginAction: { color: COLORS.accent, fontWeight: '600' },
});
