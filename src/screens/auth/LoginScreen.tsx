import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { COLORS, SPACING, FONTS, RADIUS } from '../../lib/constants';
import { AuthStackParamList } from '../../types';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [authNotice, setAuthNotice] = useState<{ tone: 'error' | 'info'; title: string; message: string } | null>(null);
  const [connStatus, setConnStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  // Test Supabase connection on mount
  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.from('users').select('id').limit(1);
        if (!error || error.code === 'PGRST116' || error.code === '42501') {
          setConnStatus('ok');
        } else {
          console.warn('Supabase check:', error.message);
          setConnStatus('ok');
        }
      } catch {
        setConnStatus('error');
      }
    })();
  }, []);

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Invalid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    setAuthNotice(null);
    try {
      const { error } = await signIn(email.trim().toLowerCase(), password);
      if (error) {
        const msg = error || 'Invalid email or password. Please try again.';
        setAuthNotice({ tone: 'error', title: 'Login Failed', message: msg });
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Cannot reach server. Check your internet.';
      setAuthNotice({ tone: 'info', title: 'Connection Issue', message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[COLORS.primary, '#0F2318']}
        style={styles.gradient}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>SB</Text>
          </View>
          <Text style={styles.appName}>SmartBiz</Text>
          <Text style={styles.tagline}>Business management simplified</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your business account</Text>

          {/* Connection status indicator */}
          {connStatus === 'error' && (
            <View style={styles.connBanner}>
              <Ionicons name="warning-outline" size={14} color="#fff" />
              <Text style={styles.connText}>Cannot reach server — check internet or Supabase URL</Text>
            </View>
          )}

          {!!authNotice && (
            <View
              style={[
                styles.noticeBanner,
                authNotice.tone === 'error' ? styles.noticeError : styles.noticeInfo,
              ]}
            >
              <Ionicons
                name={authNotice.tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'}
                size={16}
                color={authNotice.tone === 'error' ? COLORS.error : COLORS.info}
              />
              <View style={styles.noticeBody}>
                <Text style={styles.noticeTitle}>{authNotice.title}</Text>
                <Text style={styles.noticeText}>{authNotice.message}</Text>
              </View>
              <TouchableOpacity onPress={() => setAuthNotice(null)} style={styles.noticeClose}>
                <Ionicons name="close" size={14} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <Input
            label="Email address"
            placeholder="Enter your email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (authNotice) setAuthNotice(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
            error={errors.email}
          />
          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (authNotice) setAuthNotice(null);
            }}
            isPassword
            leftIcon="lock-closed-outline"
            error={errors.password}
          />

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerText}>
              Don't have an account?{' '}
              <Text style={styles.registerAction}>Create one</Text>
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
  gradient: { ...StyleSheet.absoluteFillObject },
  content: {
    flexGrow: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 460,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: SPACING['3xl'],
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  logoText: {
    color: COLORS.white,
    fontSize: FONTS.sizes['2xl'],
    fontWeight: 'bold',
  },
  appName: {
    color: COLORS.white,
    fontSize: FONTS.sizes['3xl'],
    fontWeight: '800',
  },
  tagline: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FONTS.sizes.base,
    marginTop: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  connBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  connText: {
    color: '#fff',
    fontSize: FONTS.sizes.xs,
    flex: 1,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  noticeError: {
    backgroundColor: COLORS.errorLight,
    borderColor: COLORS.error + '33',
  },
  noticeInfo: {
    backgroundColor: COLORS.infoLight,
    borderColor: COLORS.info + '33',
  },
  noticeBody: {
    flex: 1,
    gap: 2,
  },
  noticeTitle: {
    color: COLORS.text,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
  },
  noticeText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    lineHeight: 16,
  },
  noticeClose: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: FONTS.sizes['2xl'],
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.base,
    marginTop: -SPACING.sm,
  },
  forgotText: {
    color: COLORS.accent,
    fontSize: FONTS.sizes.sm,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.base,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: SPACING.md,
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
  registerLink: {
    alignItems: 'center',
  },
  registerText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.base,
  },
  registerAction: {
    color: COLORS.accent,
    fontWeight: '600',
  },
});
